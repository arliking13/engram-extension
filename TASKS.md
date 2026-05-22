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

- [ ] Inspect current git status and extension source before editing.
- [ ] Fix runtime messaging between content scripts and background worker.
- [ ] Verify Firefox MV3 messaging uses Promise-compatible behavior.
- [ ] Confirm Chrome MV3 behavior still works after messaging fixes.
- [ ] Test Claude.ai MutationObserver capture on a live or representative DOM.
- [ ] Confirm extracted messages/code blocks are stored under the correct project id.
- [ ] Confirm popup health score reads from current stored state.
- [ ] Confirm handoff export produces a continuation prompt that can be pasted into a new chat.

## In Progress

- [ ] Project continuity files added; source implementation has not changed yet.

## Done

- [x] Base extension structure exists.
- [x] Claude.ai is selected as the MVP platform.
- [x] Gemini is treated as stub/later work.
- [x] Root continuity docs created for Claude Code and Codex handoff.

## Blocked Or Needs Verification

- [ ] "No listener" runtime messaging issue needs reproduction details and fix.
- [ ] Claude.ai DOM selectors need live verification because Claude.ai markup may change.
- [ ] Current browser compatibility layer needs review before more feature work.

## Agent Update Rule

After every future source, config, or behavior change:

- Update `STATUS.md` with what changed and what was verified.
- Update `DECISIONS.md` if any durable decision changed.
- Update this file with completed, new, blocked, or reprioritized tasks.
- Commit the code/config/docs and memory updates together when the work is complete.
