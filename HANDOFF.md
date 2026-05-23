# Current Handoff

Last active agent:
Claude Code (claude-sonnet-4-6)

Current phase:
Settings: Demo Mode endpoint constant + Custom Mode provider select.

Current goal:
Demo Mode is now zero-input for judges — the Vercel endpoint is a built-in constant (DEMO_HANDOFF_ENDPOINT). Replace YOUR-VERCEL-APP with the real Vercel URL before Demo Day. Custom Mode now offers a Gemini/OpenAI provider select with a local API key field for personal use.

Immediate focus:
- Replace YOUR-VERCEL-APP in `DEMO_HANDOFF_ENDPOINT` constant (popup.js line ~57) with the real deployed Vercel URL.
- Deploy Vercel proxy backend: POST /api/handoff → Gemini 1.5 Flash. GEMINI_API_KEY lives in Vercel env vars only, never in the extension.
- Load the extension in Firefox, scan a Claude chat, click Generate Handoff — should call DEMO_HANDOFF_ENDPOINT and copy AI-generated prompt to clipboard.
- Verify Settings view stays open during 3-second polling (guard already in place).
- Verify Scan Chat, Done view, Export, and Clear still work.
- Live Firefox validation of Claude message counts (pending from prior passes).

Important architectural constraints:
- Do NOT rewrite the project structure.
- Do NOT overengineer the MVP.
- Focus on one stable platform first: Claude.ai.
- Gemini support is postponed until Claude flow is stable.

Known risks:
- Parser count/cleanup fix has been code-path verified locally but still needs manual Firefox validation against the real Claude chat/export.
- Popup render-race fix has been code-path verified locally but still needs manual Firefox popup verification.
- Live Firefox profile has not yet been used to verify the updated Claude DOM capture path.
- `web-ext` is not installed locally; `npx web-ext lint` was blocked by sandbox/network safety.
- Existing uncommitted source changes were present before this pass, including parser/popup changes.
- AI-generated uncontrolled refactors

Architecture note:
Extension → Vercel API route → Gemini API. GEMINI_API_KEY lives only in Vercel environment variables. The extension stores the Vercel endpoint URL locally (browser.storage.local). In Custom Mode, the user's Gemini API key is stored locally only, and is only used to call a user-configured proxy endpoint — it is never logged or sent to Engram servers. No real API key is hardcoded anywhere in the extension.

What changed in this pass (Demo Mode constant + Custom Mode provider select):
- DEMO_HANDOFF_ENDPOINT constant added (placeholder URL, TODO comment).
- isDemoEndpointPlaceholder() guard — tryAIHandoff() falls back immediately if constant not replaced.
- Demo Mode panel no longer has a Vercel URL input. Shows a status line (#demoStatus) set by updateDemoStatus(): amber if placeholder, green if real URL.
- Custom Mode panel: provider changed from static text to <select> (Gemini / OpenAI). Added API key security warning note.
- saveSettings() clears customApiKey and customEndpoint when saving in Demo Mode — nothing sensitive stored.
- DEFAULT_SETTINGS: demoEndpoint removed, provider renamed to customProvider.
- inputDemoEndpoint element and its input event listener removed.
- checkDemoEndpointWarning() removed; replaced by updateDemoStatus().
- Privacy note updated: "No API keys are stored in the extension."

What changed in prior pass (Settings / Demo Mode pass):
- Settings guard added to loadState(): returns early if currentState === "settings" to prevent async polling from overwriting the view.
- storageGet/storageSet helpers added for cross-browser storage.local access.
- DEFAULT_SETTINGS and engramSettings runtime object added.
- loadSettings(), applySettingsToUI(), updateModeToggle(), checkDemoEndpointWarning(), saveSettings() added to popup.js.
- tryAIHandoff(): calls configured endpoint with POST { messages }, falls back on any failure.
- btnHandoff updated: tries AI handoff first, then falls back to existing local/worker flow.
- Settings HTML: AI Handoff Generation section with Demo/Custom mode toggle, Vercel URL input, Gemini API key (password) input, optional custom endpoint, Save button, disabled Test Connection placeholder.
- CSS: mode-toggle, mode-btn, settings-input-group, settings-input, settings-warning, settings-action-row, btn-sm.
- Logs: [Engram] settings loaded, settings saved, settings view kept, demo endpoint missing, handoff fallback used. Keys are never logged.

What changed in prior passes:
- Claude parser now uses per-DOM-node source keys for DOM-captured messages so repeated user text in separate bubbles is counted.
- DOM extraction no longer globally dedupes messages by `role:text`.
- Assistant timestamp/date-only candidates are filtered, including `HH:MM` and Russian date labels such as `21 мая`.
- Assistant lines containing `Thinking about` or `Deciphered` are removed.
- Adjacent doubled assistant text is collapsed, including forms like `Привет!Привет!` and `Хорошо!Хорошо! 👍`.
- Popup now tracks `isScanning`, `hasLocalScanResult`, and `lastRenderSource` so background state polling cannot overwrite active/completed scans.
- After `ENGRAM_SCAN_COMPLETE`, popup renders and keeps `doneView` from local scan data even if `ENGRAM_GET_STATE` later returns null.
- Scan Chat is disabled while scanning to prevent spam/race clicks.
- Popup logs now include scan started, scan completed, keeping local scan result, ignoring stale state response, and rendering done state.
- Popup now calls `renderIdle()` immediately on load so a visible fallback exists before async state requests finish.
- If `ENGRAM_GET_STATE` returns null or active-tab lookup fails, popup renders idle with a small status hint and keeps Scan Chat available.
- Popup logs now include `[Engram] popup loaded`, state request/response, idle/done/error rendering, and Scan Chat clicks.
- Claude parser now treats `MutationObserver(document.body)` as the primary capture path.
- User messages are read from `[data-testid="user-message"]`.
- Assistant messages are inferred by finding `[data-testid="action-bar-copy"]` / `[data-testid="action-bar-retry"]` and walking upward to a meaningful response container, preferring `group` class containers.
- Parser dedupes by normalized `role:text`, skips already-sent messages, removes `Claude responded:`, collapses exact doubled text, and logs each important extraction step with `[Engram]`.
- Background worker routes messages through a Promise-aware router for Firefox and callback `sendResponse` for Chrome.
- Claude parser responds to `ENGRAM_START_SCAN` with a Promise on Firefox and still uses callback response on Chrome.
- Popup messaging helpers now call Firefox `browser.runtime.sendMessage`, `browser.tabs.query`, and `browser.tabs.sendMessage` as Promise APIs.
- Fire-and-forget content messages now catch Firefox Promise rejection and touch Chrome `lastError` to avoid noisy unchecked errors.

Verification completed:
- Focused Node VM parser count/cleanup harness passed for repeated user messages, Russian date filtering, internal thinking removal, and doubled assistant text cleanup.
- Focused Node VM popup race harness passed: scan completion stayed on `doneView` after a null `ENGRAM_GET_STATE` response.
- `node --check extension/popup/popup.js` passed.
- Focused Node VM popup harness passed for null `ENGRAM_GET_STATE`: `idleView` stayed visible and showed a state-unavailable hint.
- `node --check extension/platforms/claude/parser.js` passed.
- Focused Node VM parser harness passed for user selector extraction, assistant action-button ancestor extraction, assistant duplicate cleanup, and background send dedupe.
- JavaScript syntax checks passed for `worker.js`, `parser.js`, and `popup.js`.
- `git diff --check` passed for the touched messaging files.
- A local Node VM harness simulating Firefox MV3 `browser.*` Promise APIs passed for popup-to-worker, popup-to-content, and content/background messaging paths.

Commit status:
- Not committed. Manual Firefox verification is pending by request.

Required workflow:
1. Read AGENTS.md
2. Read STATUS.md
3. Read DECISIONS.md
4. Read TASKS.md
5. Read HANDOFF.md
6. Make only small reversible changes
7. Update continuity files after work
8. Commit stable checkpoints only

Recommended next action:
Reload `extension/` in Firefox, scan the same Claude chat, and confirm counts are close to visible conversation counts with no timestamp/date/internal-thinking entries in export.
