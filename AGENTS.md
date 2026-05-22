# Agent Continuity Guide

This repository is shared by Claude Code and Codex. Treat these root files as the project memory:

- `AGENTS.md` - operating rules for AI agents.
- `STATUS.md` - current project state and latest handoff notes.
- `DECISIONS.md` - durable technical and product decisions.
- `TASKS.md` - active MVP task list.
- `CLAUDE.md` - Claude-specific project context.
- `README.md` - user-facing project overview.

Read `README.md`, `CLAUDE.md`, `STATUS.md`, `DECISIONS.md`, and `TASKS.md` before making changes.

## MVP Focus

Keep all work focused on the hackathon MVP:

1. Claude.ai parser that observes chats and extracts messages/code blocks.
2. Project-isolated storage for captured conversation state.
3. Popup health score that reflects context degradation.
4. Handoff export that produces a continuation package/prompt.

Gemini support, polished settings, extra platforms, and large architecture work are secondary unless directly needed to demo the MVP.

## Change Rules

- Do not rewrite the app.
- Do not perform large uncontrolled refactors.
- Keep changes small, testable, and tied to one MVP outcome.
- Prefer existing files, APIs, and structure over new abstractions.
- Preserve cross-browser intent where practical, especially Firefox plus Chrome Manifest V3 behavior.
- Avoid changing source code and documentation in the same commit unless the docs describe that exact source change.
- Do not remove stubs or comments that document MVP direction unless replacing them with clearer current documentation.
- Do not touch unrelated files just to tidy formatting.

## Required Memory Updates

After every code, config, or behavior change, every AI agent must update:

- `STATUS.md` with what changed, what was verified, and any known issues.
- `DECISIONS.md` when a new durable decision was made or an old one changed.
- `TASKS.md` with completed, new, blocked, or reprioritized work.

If no decision changed, add no noise to `DECISIONS.md`; instead mention in `STATUS.md` that no new durable decision was made.

## Handoff Workflow

1. Start by reading the memory files listed above.
2. Inspect the current git state before editing.
3. Make the smallest useful change for the selected MVP task.
4. Run the most relevant available verification.
5. Update `STATUS.md`, `DECISIONS.md` if needed, and `TASKS.md`.
6. Commit source and memory updates together when the work is complete.
7. Leave the repo in a handoff-ready state: no unexplained edits, no hidden assumptions, and a clear next task.

## Commit Guidance

Use concise commits that another agent can continue from:

- One behavioral change per commit when feasible.
- Include memory-file updates in the same commit as the change they describe.
- Mention verification in the commit body when useful.
- Do not bundle broad refactors with bug fixes.

## Current Known Priorities

- Fix runtime messaging issues between content scripts and the background worker, especially Firefox MV3 Promise/callback compatibility.
- Verify Claude.ai MutationObserver capture with real chat DOM changes.
- Confirm captured data flows into storage under the correct project id.
- Make the popup show reliable health and handoff state.
- Ensure handoff export is useful enough for a demo continuation prompt.
