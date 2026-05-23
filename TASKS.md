# Tasks

This file is the shared task board for Claude Code and Codex. Update it after every change so the next agent knows exactly where to continue.

## Current MVP Goal

Ship a demoable Engram extension flow:

1. Observe Claude.ai chat changes.
2. Extract messages and code blocks.
3. Store captured context by project.
4. Show context health in the popup.
5. Export a useful handoff prompt/package.

## Next Up

- [x] Inspect current git status and extension source before editing.
- [x] Fix runtime messaging between content scripts and background worker.
- [x] Verify Firefox MV3 Promise-compatible code paths with a local harness.
- [x] Update Claude parser to use DOM MutationObserver capture as the primary path.
- [x] Add user selector extraction for `[data-testid="user-message"]`.
- [x] Add assistant action-button ancestor extraction and normalized dedupe.
- [x] Add popup idle fallback rendering when `ENGRAM_GET_STATE` is null or unavailable.
- [x] Guard popup done view from stale/null state polling after local scan completion.
- [x] Fix Claude parser counting so repeated user messages are not globally deduped.
- [x] Filter timestamp/date-only assistant candidates and internal thinking lines.
- [x] Collapse doubled assistant text during assistant cleanup.
- [x] Polish popup UI: CSS custom properties, improved typography/spacing, button states, stat card dividers, shimmer progress bar.
- [x] Add Settings view (state 4) with platform list, export format, privacy note, and clear action.
- [x] Add Back button from Settings to prior state.
- [x] Extend health gauge with contextual hint text per tier.
- [x] Move Settings icon to header; remove non-functional History stub.
- [ ] Verify popup opens with visible Scan Chat idle state in live Firefox.
- [ ] Verify popup done view stays visible after Scan Chat in live Firefox.
- [ ] Verify Claude scan counts are close to visible user/assistant message counts in live Firefox.
- [ ] Verify the fixed messaging path in a live loaded Firefox extension.
- [ ] Confirm Chrome MV3 behavior still works after messaging fixes.
- [ ] Test Claude.ai MutationObserver capture on a live or representative DOM.
- [ ] Confirm extracted messages/code blocks are stored under the correct project id.
- [ ] Confirm popup health score reads from current stored state.
- [ ] Confirm handoff export produces a continuation prompt that can be pasted into a new chat.
- [x] Guard Settings view from async loadState() overwrite — currentState === "settings" early return added.
- [x] Add AI Handoff Generation settings section: Demo Mode / Custom Mode toggle.
- [x] Demo Mode: Vercel endpoint URL input, secure proxy note, missing-endpoint warning.
- [x] Custom Mode: Gemini API key (password field), optional custom endpoint.
- [x] Persist settings to browser.storage.local (Save button, storageGet/storageSet helpers).
- [x] Disabled Test Connection placeholder (backend not yet deployed).
- [x] tryAIHandoff(): calls Vercel endpoint if configured, fails safely back to local export.
- [x] Generate Handoff: tries AI generation first, falls back to existing local/export flow.
- [x] Added minimal logs: settings loaded, settings saved, settings view kept, demo endpoint missing, handoff fallback used.
- [x] Updated Privacy note to be accurate about Demo Mode data flow.

## In Progress

- [ ] Live Firefox extension validation after popup fallback and Claude parser DOM capture updates.
- [ ] Live Firefox validation of LinkedIn widget fix: open https://www.linkedin.com/jobs/search-results/?currentJobId=... — widget must appear even if it only shows "LinkedIn job page detected".
- [ ] Confirm Copy AI Prompt copies 8-section structured prompt to clipboard.
- [ ] Confirm Save Job stores data — check browser.storage.local in devtools for engramSavedJobs.
- [ ] Confirm SPA navigation to a second job updates widget within ~3 seconds.
- [ ] Replace YOUR-VERCEL-APP in DEMO_HANDOFF_ENDPOINT and deploy Vercel backend.

## LinkedIn Job Skeleton (added 2026-05-23)

- [x] job-detector.js — URL + DOM detection of LinkedIn job detail pages.
- [x] linkedin-parser.js — extracts title, company, location, remoteStatus, salary, description, url, capturedAt.
- [x] job-widget.js — fixed floating widget with Save Job + Copy AI Prompt + Close; SPA nav polling.
- [x] buildJobPrompt() — 8-section structured AI evaluation prompt (legitimacy, red flags, remote quality, company credibility, salary, Canada newcomer fit, verify questions, recommendation).
- [x] ENGRAM_SAVE_JOB handler in worker.js — appends to engramSavedJobs in browser.storage.local.
- [x] manifest.json — LinkedIn content scripts + host permissions added.
- [ ] Verify widget doesn't break LinkedIn layout in live Firefox.
- [ ] Verify widget re-appears after SPA navigation to a different job.
- [ ] Verify Save Job stores correct data (check browser.storage.local in devtools).
- [ ] Wire Claude/GPT session capture to job-sourced AI analysis sessions (future pass).
- [ ] Replace YOUR-VERCEL-APP in DEMO_HANDOFF_ENDPOINT constant with real deployed Vercel URL before Demo Day.
- [ ] Deploy Vercel proxy for Demo Mode handoff generation (GEMINI_API_KEY env var needed server-side).
- [ ] Test Connection button — enable after DEMO_HANDOFF_ENDPOINT is set and Vercel backend is live.
- [x] Remove Vercel endpoint URL input from Demo Mode — endpoint is now a built-in constant.
- [x] Add isDemoEndpointPlaceholder() guard — fails safely to local export if constant not yet replaced.
- [x] Add updateDemoStatus() — shows amber "not connected" or green "connected" status in Demo panel.
- [x] Add provider select (Gemini / OpenAI) to Custom Mode.
- [x] Add API key warning note to Custom Mode.
- [x] saveSettings() clears sensitive fields when saving in Demo Mode.
- [x] tryAIHandoff() Demo path uses DEMO_HANDOFF_ENDPOINT constant, not user-entered value.

## Done

- [x] Base extension structure exists.
- [x] Claude.ai is selected as the MVP platform.
- [x] Gemini is treated as stub/later work.
- [x] Root continuity docs created for Claude Code and Codex handoff.

## Blocked Or Needs Verification

- [ ] "No listener" runtime messaging issue needs live Firefox confirmation after the Promise-path fix.
- [ ] Claude.ai DOM selectors need live Firefox verification with current `user-message` and action-bar selectors.
- [ ] Current browser compatibility layer needs review before more feature work.

## Agent Update Rule

After every future source, config, or behavior change:

- Update `STATUS.md` with what changed and what was verified.
- Update `DECISIONS.md` if any durable decision changed.
- Update this file with completed, new, blocked, or reprioritized tasks.
- Commit the code/config/docs and memory updates together when the work is complete.
