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
- [x] Stabilize Mini Health Widget dragging so it uses compact fixed left/top movement instead of resizing/stretching.
- [x] Make Claude MutationObserver ignore Engram's Mini Health Widget root.
- [x] Guard popup success/non-error status auto-clear without immediately hiding real errors.
- [x] Save popup-computed health snapshots to `browser.storage.local` for Mini Health Widget display.
- [x] Remove Mini Health Widget's independent health formula from the displayed status path.
- [x] Show "Not scanned" in the Mini Health Widget when the saved snapshot does not match the current Claude chat.
- [x] Add `engramHealthSnapshotsByChatId` map capped at 20 snapshots for previously scanned chat restoration.
- [x] Add Mini Health Widget `Live` estimate fallback for visible unscanned chats.
- [x] Refine Mini Health Widget live labels to `Likely Good/Fair/Risky/Critical`.
- [x] Update Mini Health Widget expanded copy to show exact/full-scan vs live-estimate accuracy clearly.
- [x] Unify Mini Health Widget estimated status names with popup vocabulary: `Safe/Good/Fair/Risky/Critical`.
- [x] Move estimated/full-scan distinction into secondary `Accuracy` metadata and compact `est.` badge.
- [x] Apply uploaded `DESIGN.md` visual direction to popup styling: midnight surfaces, translucent cards, violet primary CTA, blue package actions, subtle borders, 16px cards, 12px buttons.
- [x] Restyle Mini Health Widget to match the popup visual system without changing drag/status behavior.
- [x] Compact Health Meter/gauge card to reclaim vertical popup space while preserving scoring and needle behavior.
- [x] Create static Vercel-ready public landing page under `site/` using the DESIGN.md visual direction.
- [x] Add lightweight landing page motion polish with scroll reveals, restrained hover states, product glow, and reduced-motion support.
- [x] Add official Engram logo assets to landing page and popup header without changing extension behavior.
- [x] Add popup platform metadata helpers for ChatGPT/Claude/Gemini generated outputs.
- [x] Add ChatGPT popup platform display branch with OpenAI green status.
- [x] Restore cap-based health calibration v5 for dense ChatGPT/code-heavy chats.
- [x] Add ChatGPT parser dense-message metadata for `veryLargeMessageCount`, `hugeMessageCount`, and transcript likelihood.
- [x] Fix shared popup blank-state regression caused by missing Settings Back button listener target.
- [x] Add shared popup URL platform detection for Claude and ChatGPT active tabs.
- [x] Ensure supported Claude/ChatGPT tabs show Scan Chat even when worker state is null/unavailable.
- [x] Make Settings gear toggle main/settings views and remove the Back button from the current popup UI.
- [x] Add active/pressed Settings gear state while Settings is open.
- [x] Wire popup website CTAs to `https://engram-blush-tau.vercel.app/`.

## In Progress

- [ ] Live Firefox validation that Settings gear toggles main -> settings -> main on Claude and ChatGPT.
- [ ] Live Firefox validation that popup platform row and Scan Chat body render on both Claude and ChatGPT after reload.
- [ ] Live Firefox validation of ChatGPT end-to-end support: platform label, Scan Chat, Generate Handoff, migration package, export, and health behavior.
- [ ] Live Firefox validation of ChatGPT tiny/Forrest/Subway health calibration against real DOM extraction.
- [ ] Live Firefox extension validation after popup fallback and Claude parser DOM capture updates.
- [ ] Live Firefox validation of Mini Health Widget: enable setting, drag chip, reload position, edge clamp, click toggle, Scan Chat, message counters, Generate Handoff, Download ZIP, ZIP + Add Files, Export Chat, Settings Back.
- [ ] Live Firefox validation that Mini Health Widget health label, Migration Risk, Browser Load, and counts match the main popup after Scan Chat.
- [ ] Live Firefox validation that switching to an unscanned Claude chat shows `Live` with current counts instead of stale exact status.
- [ ] Live Firefox validation that switching back to a previously scanned Claude chat restores exact widget status from the snapshot map.
- [ ] Live Firefox validation that unscanned visible chats show shared status names with `Accuracy: Estimated`, not generic `Live` or `Not scanned`.
- [ ] Live Firefox validation that estimated and full-scan Mini Health Widget modes use the same status names and only `Accuracy` changes.
- [ ] Live Firefox visual review after DESIGN.md styling pass: popup hierarchy, settings spacing, migration package grouping, and mini-widget compact/expanded appearance.
- [ ] Live Firefox visual validation that compact Health Meter remains readable and bottom actions are easier to access.
- [ ] Browser visual review of `site/` landing page across desktop and mobile widths.
- [ ] Browser visual review that landing page motion feels subtle, premium, and respects reduced-motion preferences.
- [ ] Browser/extension visual review that official logo appears crisp in landing page header/footer/hero and popup header.
- [ ] Deploy `site/` landing page to Vercel after review.
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
