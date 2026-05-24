# Project Status

Last updated: 2026-05-25 by Codex.

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
- Optional Mini Health Widget WIP is present behind the Settings toggle and defaults off.
- Mini Health Widget drag handling now uses fixed `left/top` positioning after interaction starts, clamps inside the viewport, and saves position only after a completed drag.
- Claude MutationObserver ignores Engram's widget root so widget DOM updates do not trigger chat rescans.
- Popup success/non-error status messages now clear with a guarded timer so newer statuses and real errors are not immediately hidden.
- Popup now persists the last popup-computed health snapshot to `browser.storage.local` under `engramLastHealthSnapshot`.
- Mini Health Widget reads that stored snapshot for health label, migration risk, browser load, counts, and last scan time instead of computing its own health formula.
- Popup also keeps a bounded `engramHealthSnapshotsByChatId` map of the latest 20 health snapshots so returning to a previously scanned chat can restore exact widget status.
- Mini Health Widget now falls back to a clearly labeled `Live` estimate when the current chat has visible messages but no matching exact snapshot.
- Mini Health Widget live fallback now uses the shared `Safe/Good/Fair/Risky/Critical` status vocabulary, with estimated accuracy shown separately.
- Popup visual styling now follows the uploaded `DESIGN.md` direction: midnight background, translucent cards, violet primary actions, blue secondary package actions, subtle borders, and 16px card radius.
- Popup Health Meter card is now more compact so the Migration Package and bottom actions are easier to reach.
- Mini Health Widget styling now matches the popup visual system while preserving its compact draggable behavior.
- Public Engram landing page now exists under `site/` as a separate static, Vercel-ready package.
- Landing page now has lightweight premium motion: hero entrance, scroll reveals, restrained hover states, product glow, and reduced-motion support.
- Official Engram transparent PNG logo assets are now available under `site/public/assets/` and `extension/assets/`, and are used in the landing page plus popup header.
- ChatGPT parser support is present for `chatgpt.com` and `chat.openai.com`.
- Popup platform metadata now resolves ChatGPT, Claude.ai, Gemini, or Unknown from scan metadata and source URL.
- Popup ChatGPT display branch now shows `CHATGPT` in OpenAI green on ChatGPT pages.
- Popup health scoring is restored to cap-based calibration v5 for dense ChatGPT/code-heavy payloads while keeping browser load separate from migration risk.
- Tracked text files are English-only after translating/removing Cyrillic project memory and extraction-test examples.

## Known Issues To Preserve

- Live Firefox extension testing is still needed with the extension loaded from `extension/`.
- `web-ext` is not installed locally; `npx web-ext lint` was attempted but blocked by sandbox/network safety.
- Firefox Promise-path messaging was verified with a local Node VM harness, not by clicking through a live Firefox profile.
- `utils/compat.js` is not currently loaded by `manifest.json`; active fixes were applied directly to the worker, popup, and Claude parser messaging paths.
- Claude.ai MutationObserver capture still needs manual Firefox verification against the live page after the DOM selector update.
- Mini Health Widget still needs live Firefox/Claude validation for drag, reload restoration, scan completion, handoff export, ZIP export, ZIP + files, Export Chat, Settings Back, and LinkedIn Copy AI Prompt regression.
- Mini Health Widget health snapshot matching still needs live verification that same-chat snapshots display and stale cross-chat snapshots show "Not scanned".
- Mini Health Widget hybrid mode still needs live verification while switching among scanned and unscanned Claude chats.
- Mini Health Widget status vocabulary still needs live verification that estimated mode and full-scan mode use the same status names with only `Accuracy` changing.
- Visual refresh still needs live browser review for popup density, button grouping, settings readability, and mini-widget drag/position behavior.
- Landing page still needs browser visual review across desktop/mobile and Vercel deployment after review.
- ChatGPT support still needs live Firefox validation on tiny, dense, and code-heavy chats, plus Claude regression testing.

## Last Code Change

- Removed Cyrillic text from tracked project documentation and memory files.
- Translated `CLAUDE.md` to English.
- Replaced Cyrillic example strings in `HANDOFF.md`, `STATUS.md`, and `docs/CHATGPT_EXTRACTION_TESTS.md` with English examples.
- Verified tracked text files contain no Cyrillic characters.
- Ran `node --check` for `extension/background/worker.js`, `extension/popup/popup.js`, `extension/platforms/chatgpt/parser.js`, and `extension/platforms/claude/parser.js`.
- Ran `npm.cmd --prefix site run build`; PowerShell blocked `npm --prefix site run build` because `npm.ps1` scripts are disabled.
- No new durable product or architecture decision was made.

## Previous Code Change

- Fixed Settings navigation so the header gear is now a true toggle.
- Root cause: the gear click handler returned immediately when `currentState === "settings"`, so it could open Settings but could not close it.
- Removed the Settings Back button from `popup.html`; Settings now exits through the same gear button.
- `showState()` now updates the gear's `.settings-active` class, `aria-pressed`, `aria-label`, and title so Settings mode is visibly and accessibly indicated.
- Closing Settings restores the prior main popup state when available, otherwise falls back to the correct scan/result/scanning state and refreshes active-tab detection through `loadState()`.
- Local popup harness verified `main -> settings -> main` on a ChatGPT URL while preserving `CHATGPT`, Scan Chat visibility, gear active state, title, and `aria-pressed`.
- No site files, parsers, health scoring, handoff generation, ZIP writer logic, or migration package logic were changed.
- No new durable product or architecture decision was made.

## Previous Code Change

- Fixed shared popup initialization regression where the popup body stayed blank and the platform row stayed `—`.
- Root cause: `popup.js` attempted to bind a click listener to `#btnBack`, but the current `popup.html` no longer contained that element. The thrown error stopped the init block before `renderIdle()` and `loadState()` ran.
- Added guarded popup event binding via `on(id, eventName, handler)` so missing optional elements log a warning instead of stopping popup initialization.
- Restored the Settings Back button in `popup.html`.
- Added shared `detectPlatformFromUrl(url)` and `updatePlatformDisplay(platform)` helpers in `popup.js`.
- Updated `loadState()` to use shared active-tab platform detection and immediately render the Scan Chat idle view on supported Claude/ChatGPT pages, even when `ENGRAM_GET_STATE` is null/unavailable.
- Local popup harness verified `https://claude.ai/chat/...` renders `CLAUDE` with Scan enabled, and both `https://chatgpt.com/c/...` plus `https://chat.openai.com/c/...` render `CHATGPT` with Scan enabled.
- No site files, parser behavior, health scoring, ZIP writer logic, Generate Handoff logic, or Migration Package ZIP logic were changed in this pass.
- No new durable product or architecture decision was made.

## Previous Code Change

- Added `getPlatformId()` and `getPlatformDisplayName()` helpers in `extension/popup/popup.js`.
- Updated generated handoff, full chat export, README package summary, health snapshots, and migration package manifest to use platform helpers instead of hardcoded Claude defaults.
- Added ChatGPT popup platform display (`CHATGPT`, `#10a37f`) and replaced Claude-only reload/open-page error copy with platform-neutral wording.
- Restored cap-based health calibration v5 in the popup. Simulated checks: tiny chat `100 / Low / Safe to continue`; Forrest dense payload `83 / Moderate / Safe for now, but consider handoff soon`; Subway code-heavy workflow `70 / Elevated / Consider handoff soon`; 9k text-only control `95 / Low / Safe to continue`.
- Added ChatGPT parser metadata fields: `veryLargeMessageCount`, `hugeMessageCount`, and `likelyEmbeddedTranscript`.
- No site files, ZIP writer logic, Claude parser behavior, Scan Chat logic, Generate Handoff logic, or Migration Package ZIP logic were changed in this pass.
- No new durable product or architecture decision was made.

- Added the official user-provided Engram logo PNG assets.
- Copied the transparent icon and wordmark into `site/public/assets/` and `extension/assets/`.
- Updated the landing page header, favicon, hero accent, product mock branding, and footer to use the official logo assets without changing the site positioning or product claims.
- Updated the popup header to use the official icon next to the visible `Engram` wordmark; settings, mini widget, manifest icons, and extension behavior were left unchanged.
- Updated the static site build/preview scripts so `site/public/assets` is copied to `site/dist` and served during local preview.
- No Health Meter, Scan Chat, Generate Handoff, Migration Package ZIP, parser, mini-widget drag, or backend behavior changed.
- No new durable product or architecture decision was made.

## Verification

- `npm.cmd run build` from `site/`
- `node --check extension/popup/popup.js`
- `node --check extension/platforms/claude/parser.js`
- `node --check extension/utils/zip-writer.js`
- `node --check site/scripts/build.mjs`
- `node --check site/scripts/serve.mjs`
- `git diff --check` passed with only existing Git config/CRLF warnings.

## Previous Code Change

- Added lightweight motion polish to the static landing page under `site/`.
- `site/src/styles.css` now includes subtle hero entrance animation, product mock glow, card/workflow hover states, slow background aura/grid movement, status glow, and a `prefers-reduced-motion` override.
- `site/src/main.js` now adds IntersectionObserver-based scroll reveal classes and disables pointer/tilt/reveal animation behavior for reduced-motion users.
- Extension functionality and extension files were not changed for this motion pass.
- No new durable product or architecture decision was made.

## Previous Verification

- `npm.cmd run build` from `site/`
- `node --check site/src/main.js`
- `git diff --check -- site`

## Previous Code Change

- Added a separate public landing page under `site/`.
- Built the site as a no-dependency static package with `site/src` source files, a Node build script, a local preview script, `vercel.json`, and `site/README.md`.
- Landing page includes Hero, Feature cards, How it works, Screenshot placeholders, Privacy, and CTA sections using the uploaded midnight/violet/blue `DESIGN.md` visual direction.
- Added `site/dist/` and `site/node_modules/` to `.gitignore`; the extension source and behavior were not changed for this site work.
- Added a durable decision that the public landing page remains isolated as a separate static site under `site/`.

## Previous Verification

- `node --check site/scripts/build.mjs`
- `node --check site/scripts/serve.mjs`
- `node --check site/src/main.js`
- `npm.cmd install`
- `npm.cmd run build`
- `git diff --check` passed with only existing Git config/CRLF warnings.
- Direct `npm install` in PowerShell was blocked by the local `npm.ps1` execution policy; `npm.cmd install` passed.

## Previous Code Change

- Compacted the popup Health Meter layout in `extension/popup/popup.css`.
- Reduced the gauge wrapper size, gauge card padding, internal spacing, label placement, status type size, and hint height.
- Kept the existing Health Meter SVG/needle markup and all scoring, Scan Chat, Generate Handoff, ZIP export, Claude parser, storage, and LinkedIn behavior unchanged.
- No new durable product or architecture decision was made.

## Previous Verification

- `node --check extension/popup/popup.js`
- `node --check extension/platforms/claude/parser.js`
- `git diff --check` passed with only existing Git config/CRLF warnings.

## Previous Code Change

- Applied the uploaded `DESIGN.md` visual system to the compact extension UI.
- Rebuilt `extension/popup/popup.css` around the design tokens: deep black/midnight surfaces, translucent card backgrounds, subtle borders, violet primary CTAs, blue migration-package actions, muted secondary text, 16px cards, 12px buttons, and 10px inputs.
- Refined popup hierarchy through styling only: gauge, health panel, stats, migration package, actions, and settings now use consistent card/button treatments without changing popup behavior.
- Updated Mini Health Widget injected CSS to use the same midnight glass surface, violet Engram label, subtle border, compact typography, and 16px radius.
- Did not change health scoring, Scan Chat, Generate Handoff, ZIP export logic, storage logic, message extraction, or LinkedIn files.
- No new durable product or architecture decision was made.

## Previous Verification

- `node --check extension/platforms/claude/parser.js`
- `node --check extension/popup/popup.js`
- `node --check extension/utils/zip-writer.js`
- `git diff --check` passed with only existing Git config/CRLF warnings.

## Previous Code Change

- Unified Mini Health Widget and popup status naming.
- Estimated widget mode now maps visible chat data to `Safe`, `Fair`, `Risky`, or `Critical` instead of `Likely ...` labels; small chats now show `Safe`, matching the popup vocabulary.
- Estimated mode keeps accuracy separate with a compact `est.` badge/tooltip and an expanded `Accuracy: Estimated` row.
- Exact full-scan mode continues to display the popup snapshot status exactly, with `Accuracy: Full scan` and no `est.` badge.
- No-data compact state remains `Waiting for chat`; expanded state says `No readable chat data yet.`
- Prior drag positioning, Settings toggle, scan logic, handoff, ZIP export, exact snapshot matching, and MutationObserver widget-ignore behavior were preserved.
- No new durable product or architecture decision was made.

## Previous Verification

- `node --check extension/platforms/claude/parser.js`
- `node --check extension/popup/popup.js`
- `node --check extension/utils/zip-writer.js`
- `git diff --check` passed with only existing Git config/CRLF warnings.

## Previous Code Change

- Refined Mini Health Widget live and exact status wording/design.
- Exact full-scan mode still uses popup snapshot values, but expanded labels now read `Status`, `Risk`, `Load`, `Messages`, `Code blocks`, `Accuracy: Full scan`, and `Last scan`.
- Live estimate mode now uses deterministic visible-data thresholds: `Likely Critical` at 250+ messages or 80+ code blocks, `Likely Risky` at 120+ messages or 30+ code blocks, `Likely Fair` at 60+ messages or 10+ code blocks, and `Likely Good` otherwise.
- Live expanded copy now says it is based on visible chat activity, shows `Accuracy: Live estimate`, and notes that a full scan creates a handoff-ready report.
- No-data mode now says `Waiting for chat` / `No readable chat data yet` instead of presenting `Not scanned` as the primary state.
- Prior drag positioning, Settings toggle, exact snapshot matching, and MutationObserver widget-ignore behavior were preserved.
- No new durable product or architecture decision was made.

## Previous Verification

- `node --check extension/platforms/claude/parser.js`
- `node --check extension/popup/popup.js`
- `node --check extension/utils/zip-writer.js`
- `git diff --check` passed with only existing Git config/CRLF warnings.

## Previous Code Change

- Added Mini Health Widget hybrid status behavior for chat switching.
- Popup health snapshot persistence now writes both `engramLastHealthSnapshot` and a bounded `engramHealthSnapshotsByChatId` map keyed by chat id or normalized URL.
- Mini Health Widget resolves exact status from the snapshot map first, then the latest snapshot, and only displays exact health labels when the snapshot matches the current chat.
- If no exact snapshot matches but visible messages are available, the widget shows `Live` with current message/code counts, `Source: Live page read`, and a hint to run the full popup scan.
- If neither exact snapshot nor visible messages are available, the widget still shows `Not scanned`.
- Live estimate colors are simple volume indicators and do not reuse popup health labels such as Good/Risky/Critical.
- Prior drag positioning and MutationObserver widget-ignore behavior were preserved.
- No new durable product or architecture decision was made.

## Previous Verification

- `node --check extension/platforms/claude/parser.js`
- `node --check extension/popup/popup.js`
- `node --check extension/utils/zip-writer.js`
- `git diff --check` passed with only existing Git config/CRLF warnings.

## Previous Code Change

- Aligned Mini Health Widget status with the main popup health data.
- Added shared popup health display helper for gauge label/color/hint and snapshot label/color.
- `renderDone()` now saves `engramLastHealthSnapshot` after computing health from `scanResults`.
- Snapshot includes chat id, source URL/title, platform, scan time, health score/label/color, migration risk, browser load, action, reasons, and scan counts.
- Mini Health Widget now reads `engramLastHealthSnapshot` and displays the stored popup-computed health label, migration risk, browser load, counts, and last scan time.
- Widget shows "Not scanned" when there is no snapshot or when the snapshot does not match the current Claude chat by chat id or normalized URL.
- Widget still updates only from its own interval/storage-change path, not from DOM mutations; prior drag behavior is preserved.
- No new durable product or architecture decision was made.

## Previous Verification

- `node --check extension/platforms/claude/parser.js`
- `node --check extension/popup/popup.js`
- `node --check extension/utils/zip-writer.js`
- `git diff --check` passed with only existing Git config/CRLF warnings.

## Previous Code Change

- Stabilized Mini Health Widget drag behavior in `extension/platforms/claude/parser.js`.
- Widget position persistence now stores `{ left, top }` and still accepts older `{ x, y }` saved positions.
- Widget drag starts from `getBoundingClientRect()`, switches the root to inline `left/top`, sets `right/bottom` to `auto`, clamps with an 8px viewport margin, and writes storage only on pointerup after actual movement.
- Widget CSS now keeps the root compact with `width: max-content`, `max-width: 260px`, `height: auto`, `resize: none`, and `overflow: hidden`.
- Widget click without drag still toggles collapsed/expanded state; drag no longer toggles.
- MutationObserver callback now skips widget-only mutations.
- Settings copy now reads "Show mini health widget on chat pages"; default remains off.
- Popup status cleanup now uses a guarded clear timer for successful/non-error handoff/export/package messages and does not auto-clear package/export errors.
- No new durable product or architecture decision was made.

## Previous Verification

- `node --check extension/platforms/claude/parser.js`
- `node --check extension/popup/popup.js`
- `node --check extension/utils/zip-writer.js`
- `git diff --check` passed with only existing Git config/CRLF warnings.

## Previous Code Change

- Updated `extension/platforms/claude/parser.js` message identity so DOM messages use stable per-node source keys instead of global `role:text` dedupe.
- Repeated user messages such as "hello", "all right", and "okay" should now count when they are separate DOM message nodes.
- Assistant timestamp/date-only candidates such as `14:02` and `May 21` are filtered.
- Assistant internal/thinking lines containing `Thinking about` or `Deciphered` are skipped.
- Adjacent doubled assistant text such as `Hello!Hello!` and `All right!All right!` is collapsed.
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

## Previous Verification

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
