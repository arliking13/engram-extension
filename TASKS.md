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
- [ ] Verify popup opens with visible Scan Chat idle state in live Firefox.
- [ ] Verify popup done view stays visible after Scan Chat in live Firefox.
- [ ] Verify Claude scan counts are close to visible user/assistant message counts in live Firefox.
- [ ] Verify the fixed messaging path in a live loaded Firefox extension.
- [ ] Confirm Chrome MV3 behavior still works after messaging fixes.
- [ ] Test Claude.ai MutationObserver capture on a live or representative DOM.
- [ ] Confirm extracted messages/code blocks are stored under the correct project id.
- [ ] Confirm popup health score reads from current stored state.
- [ ] Confirm handoff export produces a continuation prompt that can be pasted into a new chat.

## In Progress

- [ ] Live Firefox extension validation after popup fallback and Claude parser DOM capture updates.

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
